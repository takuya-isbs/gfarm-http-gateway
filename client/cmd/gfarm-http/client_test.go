package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestAPIChmodUsesPut(t *testing.T) {
	t.Setenv("GFARM_SASL_USER", "anonymous")
	t.Setenv("GFARM_SASL_PASSWORD", "")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if r.URL.Path != "/attr/tmp/test-file" {
			t.Errorf("unexpected request path %q", r.URL.Path)
		}
		var body map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode request body: %v", err)
		}
		if body["Mode"] != "0751" {
			t.Errorf("unexpected mode %q", body["Mode"])
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewClient(server.URL, false, false, server.Client())
	if err := client.cmdChmod("0751", "/tmp/test-file"); err != nil {
		t.Fatalf("cmdChmod returned an error: %v", err)
	}
}

func TestAPICopyUsesPut(t *testing.T) {
	t.Setenv("GFARM_SASL_USER", "anonymous")
	t.Setenv("GFARM_SASL_PASSWORD", "")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if r.URL.Path != "/copy" {
			t.Errorf("unexpected request path %q", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewClient(server.URL, false, false, server.Client())
	if err := client.cmdCopy("/tmp/source", "/tmp/destination"); err != nil {
		t.Fatalf("cmdCopy returned an error: %v", err)
	}
}

func TestAPISetfaclUsesPut(t *testing.T) {
	t.Setenv("GFARM_SASL_USER", "anonymous")
	t.Setenv("GFARM_SASL_PASSWORD", "")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if r.URL.Path != "/acl/tmp/test-file" {
			t.Errorf("unexpected request path %q", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewClient(server.URL, false, false, server.Client())
	if err := client.cmdSetfacl("/tmp/test-file", "user:user1:rwx"); err != nil {
		t.Fatalf("cmdSetfacl returned an error: %v", err)
	}
}

func TestUnitLogRequestRedactsAuthorization(t *testing.T) {
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatalf("create pipe: %v", err)
	}
	originalStderr := os.Stderr
	os.Stderr = writer
	defer func() {
		os.Stderr = originalStderr
		_ = reader.Close()
		_ = writer.Close()
	}()

	request := httptest.NewRequest(http.MethodGet, "http://example.test/", nil)
	request.Header.Set("Authorization", "Bearer secret-token")
	client := NewClient("http://example.test", true, false, http.DefaultClient)
	client.logRequest(request)
	if err := writer.Close(); err != nil {
		t.Fatalf("close pipe writer: %v", err)
	}

	output, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("read captured log: %v", err)
	}
	if strings.Contains(string(output), "secret-token") {
		t.Fatal("request log exposed the authorization value")
	}
	if !strings.Contains(string(output), "Authorization: [redacted]") {
		t.Fatal("request log did not mark the authorization value as redacted")
	}
}

