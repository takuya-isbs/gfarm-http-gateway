package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path"
	"strings"
	"testing"
)

type openAPIDocument struct {
	Paths      map[string]map[string]openAPIOperation `json:"paths"`
	Components struct {
		Schemas map[string]map[string]any `json:"schemas"`
	} `json:"components"`
}

type openAPIOperation struct {
	Parameters  []map[string]any `json:"parameters"`
	RequestBody map[string]any   `json:"requestBody"`
}

func TestCLIRequestsMatchServerOpenAPI(t *testing.T) {
	specJSON := os.Getenv("GFARM_HTTP_OPENAPI_JSON")
	if specJSON == "" {
		t.Skip("GFARM_HTTP_OPENAPI_JSON is set by make test-contract")
	}
	var spec openAPIDocument
	if err := json.Unmarshal([]byte(specJSON), &spec); err != nil {
		t.Fatalf("decode server OpenAPI: %v", err)
	}
	t.Setenv("GFARM_SASL_USER", "anonymous")
	t.Setenv("GFARM_SASL_PASSWORD", "")

	tests := []struct {
		name string
		call func(*Client) error
	}{
		{"cmdLs", func(c *Client) error { return c.cmdLs("/tmp", true, true, false, true, true, true) }},
		{"cmdDownload", func(c *Client) error { return c.cmdDownload("/tmp/file", "/dev/null") }},
		{"cmdUpload", func(c *Client) error { return c.cmdUpload("/dev/null", "/tmp/file") }},
		{"cmdMkdir", func(c *Client) error { return c.cmdMkdir("/tmp/dir", true) }},
		{"cmdRm", func(c *Client) error { return c.cmdRm("/tmp/file", true, true) }},
		{"cmdRmdir", func(c *Client) error { return c.cmdRmdir("/tmp/dir") }},
		{"cmdChmod", func(c *Client) error { return c.cmdChmod("0755", "/tmp/file") }},
		{"cmdStat", func(c *Client) error { return c.cmdStat("/tmp/file", true, true) }},
		{"cmdMv", func(c *Client) error { return c.cmdMv("/tmp/a", "/tmp/b") }},
		{"cmdWhoami", func(c *Client) error { return c.cmdWhoami() }},
		{"cmdCopy", func(c *Client) error { return c.cmdCopy("/tmp/a", "/tmp/b") }},
		{"cmdLn/symlink", func(c *Client) error { return c.cmdLn("/tmp/a", "/tmp/b", true) }},
		{"cmdLn/hardlink", func(c *Client) error { return c.cmdLn("/tmp/a", "/tmp/b", false) }},
		{"cmdTar", func(c *Client) error { return c.cmdTar("create", "/tmp", "/tmp", []string{"file"}, nil) }},
		{"cmdGetfacl", func(c *Client) error { return c.cmdGetfacl("/tmp/file") }},
		{"cmdSetfacl", func(c *Client) error { return c.cmdSetfacl("/tmp/file", "user:user1:rwx") }},
		{"cmdUsers", func(c *Client) error { return c.cmdUsers(true) }},
		{"cmdGroups", func(c *Client) error { return c.cmdGroups(true) }},
		{"cmdUserInfo", func(c *Client) error { return c.cmdUserInfo() }},
		{"cmdZip", func(c *Client) error { return c.cmdZip([]string{"/tmp/file"}, "/dev/null") }},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var request *http.Request
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				request = r.Clone(r.Context())
				body, err := io.ReadAll(r.Body)
				if err != nil {
					t.Errorf("capture request body: %v", err)
				}
				request.Body = io.NopCloser(bytes.NewReader(body))
				w.WriteHeader(http.StatusOK)
			}))
			defer server.Close()
			client := NewClient(server.URL, false, false, server.Client())
			if err := tc.call(client); err != nil {
				t.Fatalf("CLI request failed: %v", err)
			}
			if request == nil {
				t.Fatal("CLI did not send a request")
			}
			if tc.name == "cmdLn/hardlink" && request.URL.Query().Get("symlink") != "false" {
				t.Fatalf("hardlink must explicitly disable the API's default symlink mode")
			}
			if err := validateOpenAPIRequest(request, &spec); err != nil {
				t.Fatalf("request %s %s violates server OpenAPI: %v", request.Method, request.URL, err)
			}
			t.Logf("%s request matches OpenAPI: %s %s", tc.name, request.Method, request.URL.Path)
		})
	}
}

func validateOpenAPIRequest(request *http.Request, spec *openAPIDocument) error {
	var operation *openAPIOperation
	for route, methods := range spec.Paths {
		if routeMatches(route, request.URL.Path) {
			if candidate, ok := methods[strings.ToLower(request.Method)]; ok {
				operation = &candidate
				break
			}
		}
	}
	if operation == nil {
		return fmt.Errorf("no matching operation")
	}
	params := map[string]map[string]any{}
	for _, parameter := range operation.Parameters {
		if parameter["in"] == "query" {
			params[parameter["name"].(string)] = parameter
		}
	}
	for key, values := range request.URL.Query() {
		parameter, ok := params[key]
		if !ok {
			return fmt.Errorf("query parameter %q is not documented", key)
		}
		for _, value := range values {
			if err := validateScalar(value, parameter["schema"].(map[string]any)); err != nil {
				return fmt.Errorf("query parameter %q: %w", key, err)
			}
		}
	}
	if operation.RequestBody == nil {
		if request.ContentLength > 0 {
			return fmt.Errorf("request body is not documented")
		}
		return nil
	}
	body := operation.RequestBody
	if ref, ok := body["$ref"].(string); ok {
		body = resolveOpenAPIRef(ref, spec)
	}
	content, _ := body["content"].(map[string]any)
	if len(content) == 0 {
		return fmt.Errorf("requestBody has no content schema")
	}
	mediaType := strings.ToLower(strings.Split(request.Header.Get("Content-Type"), ";")[0])
	media, ok := content[mediaType].(map[string]any)
	if !ok {
		return fmt.Errorf("Content-Type %q is not documented", mediaType)
	}
	schema, _ := media["schema"].(map[string]any)
	if schema == nil {
		return nil
	}
	if ref, ok := schema["$ref"].(string); ok {
		schema = resolveOpenAPIRef(ref, spec)
	}
	raw, err := io.ReadAll(request.Body)
	if err != nil {
		return err
	}
	switch mediaType {
	case "application/json":
		var value map[string]any
		if err := json.Unmarshal(raw, &value); err != nil {
			return fmt.Errorf("decode JSON body: %w", err)
		}
		properties, _ := schema["properties"].(map[string]any)
		for _, field := range stringSlice(schema["required"]) {
			if _, ok := value[field]; !ok {
				return fmt.Errorf("required JSON property %q is missing", field)
			}
		}
		for field, fieldValue := range value {
			fieldSchema, ok := properties[field].(map[string]any)
			if !ok {
				return fmt.Errorf("JSON property %q is not documented", field)
			}
			if err := validateJSONValue(fieldValue, fieldSchema); err != nil {
				return fmt.Errorf("JSON property %q: %w", field, err)
			}
		}
	case "application/x-www-form-urlencoded":
		values, err := url.ParseQuery(string(raw))
		if err != nil {
			return err
		}
		properties, _ := schema["properties"].(map[string]any)
		for field := range values {
			if _, ok := properties[field]; !ok {
				return fmt.Errorf("form field %q is not documented", field)
			}
		}
		for _, field := range stringSlice(schema["required"]) {
			if len(values[field]) == 0 {
				return fmt.Errorf("required form field %q is missing", field)
			}
		}
		for field, fieldValues := range values {
			fieldSchema, _ := properties[field].(map[string]any)
			if fieldSchema["type"] == "array" {
				itemSchema, _ := fieldSchema["items"].(map[string]any)
				for _, value := range fieldValues {
					if err := validateScalar(value, itemSchema); err != nil {
						return fmt.Errorf("form field %q: %w", field, err)
					}
				}
			} else {
				for _, value := range fieldValues {
					if err := validateScalar(value, fieldSchema); err != nil {
						return fmt.Errorf("form field %q: %w", field, err)
					}
				}
			}
		}
	}
	return nil
}

func validateScalar(value string, schema map[string]any) error {
	if schema["type"] == "boolean" && value != "true" && value != "false" {
		return fmt.Errorf("%q is not a boolean literal", value)
	}
	if enum := stringSlice(schema["enum"]); len(enum) > 0 {
		for _, item := range enum {
			if value == item {
				return nil
			}
		}
		return fmt.Errorf("%q is outside enum %v", value, enum)
	}
	return nil
}

func validateJSONValue(value any, schema map[string]any) error {
	typeName, _ := schema["type"].(string)
	switch typeName {
	case "string":
		if _, ok := value.(string); !ok {
			return fmt.Errorf("expected string")
		}
	case "boolean":
		if _, ok := value.(bool); !ok {
			return fmt.Errorf("expected boolean")
		}
	case "array":
		if _, ok := value.([]any); !ok {
			return fmt.Errorf("expected array")
		}
	case "object":
		if _, ok := value.(map[string]any); !ok {
			return fmt.Errorf("expected object")
		}
	}
	return nil
}

func resolveOpenAPIRef(ref string, spec *openAPIDocument) map[string]any {
	name := path.Base(ref)
	return spec.Components.Schemas[name]
}

func routeMatches(route, requestPath string) bool {
	parts := strings.Split(strings.Trim(route, "/"), "/")
	actual := strings.Split(strings.Trim(requestPath, "/"), "/")
	for i, part := range parts {
		if strings.HasPrefix(part, "{") && strings.HasSuffix(part, "}") {
			if strings.HasSuffix(part, ":path}") || i == len(parts)-1 {
				return i < len(actual)
			}
			if i >= len(actual) {
				return false
			}
			continue
		}
		if i >= len(actual) || actual[i] != part {
			return false
		}
	}
	return len(parts) == len(actual)
}

func stringSlice(value any) []string {
	items, _ := value.([]any)
	result := make([]string, 0, len(items))
	for _, item := range items {
		if text, ok := item.(string); ok {
			result = append(result, text)
		}
	}
	return result
}
