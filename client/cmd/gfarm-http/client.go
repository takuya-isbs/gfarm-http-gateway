package main

import (
	"bufio"
	"context"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	DefaultDirMode  = 0o755
	DefaultFileMode = 0o644
	DefaultTimeout  = 30 * time.Second
)

type HTTPError struct {
	StatusCode int
	Message    string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("HTTP %d: %s", e.StatusCode, e.Message)
}

type Client struct {
	BaseURL    string
	Verbose    bool
	Insecure   bool
	HTTPClient *http.Client
}

func NewClient(baseURL string, verbose, insecure bool, httpClient *http.Client) *Client {
	return &Client{
		BaseURL:    baseURL,
		Verbose:    verbose,
		Insecure:   insecure,
		HTTPClient: httpClient,
	}
}

func (c *Client) generateURL(api, path string, params url.Values) string {
	fullURL := c.BaseURL
	if api != "" {
		fullURL += "/" + api
	}
	if path != "" {
		fullURL += "/" + encodePath(path)
	}
	if len(params) > 0 {
		fullURL += "?" + params.Encode()
	}
	return fullURL
}

func (c *Client) vlogf(format string, a ...any) {
	if c.Verbose {
		fmt.Fprintf(os.Stderr, format, a...)
	}
}

func (c *Client) logRequest(req *http.Request) {
	if !c.Verbose {
		return
	}
	c.vlogf("=> %s %s\n", req.Method, req.URL.String())
	for k, vs := range req.Header {
		for _, v := range vs {
			if strings.EqualFold(k, "Authorization") {
				v = "[redacted]"
			}
			c.vlogf("   %s: %s\n", k, v)
		}
	}
}

func (c *Client) makeHTTPRequest(method, requestURL string, data any, headers map[string]string, outputFile string, uploadFile string) error {
	ctx, cancel := context.WithTimeout(context.Background(), DefaultTimeout)
	defer cancel()

	if headers == nil {
		headers = make(map[string]string)
	}

	body, cleanup, err := prepareRequestBody(data, uploadFile, headers)
	if err != nil {
		return err
	}
	defer cleanup()

	req, err := createRequest(ctx, method, requestURL, body)
	if err != nil {
		return err
	}

	for k, v := range headers {
		req.Header.Set(k, v)
	}

	c.logRequest(req)

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}

	err = handleResponse(resp, outputFile)
	if err != nil {
		return err
	}

	return nil
}

func (c *Client) cmdLs(gfarmPath string, all, effective, longf, timef, recursive, json bool) error {
	if gfarmPath == "" {
		return fmt.Errorf("gfarm-path is required")
	}
	params := url.Values{}
	if all {
		params.Set("show_hidden", strconv.FormatBool(true))
	}
	if effective {
		params.Set("effperm", strconv.FormatBool(true))
	}
	if longf {
		params.Set("long_format", strconv.FormatBool(true))
	} else {
		params.Set("long_format", strconv.FormatBool(false))
	}
	if timef {
		params.Set("time_format", "full")
	} else {
		params.Set("time_format", "short")
	}
	if recursive {
		params.Set("recursive", strconv.FormatBool(true))
	}
	if json {
		params.Set("output_format", "json")
	} else {
		params.Set("output_format", "plain")
	}
	u := c.generateURL("dir", gfarmPath, params)
	return c.makeHTTPRequest("GET", u, nil, nil, "", "")
}

func (c *Client) cmdDownload(gfarmPath, localPath string) error {
	if gfarmPath == "" || localPath == "" {
		return fmt.Errorf("both Gfarm-path and Local-path are required")
	}
	u := c.generateURL("file", gfarmPath, nil)
	return c.makeHTTPRequest("GET", u, nil, nil, localPath, "")
}

func (c *Client) cmdUpload(localPath, gfarmPath string) error {
	if localPath == "" || gfarmPath == "" {
		return fmt.Errorf("both Local-path and Gfarm-path are required")
	}
	u := c.generateURL("file", gfarmPath, nil)
	return c.makeHTTPRequest("PUT", u, nil, nil, "", localPath)
}

func (c *Client) cmdMkdir(gfarmPath string, parents bool) error {
	if gfarmPath == "" {
		return fmt.Errorf("gfarm-path is required")
	}
	params := url.Values{}
	if parents {
		params.Set("p", strconv.FormatBool(true))
	}
	u := c.generateURL("dir", gfarmPath, params)
	return c.makeHTTPRequest("PUT", u, nil, nil, "", "")
}

func (c *Client) cmdRm(gfarmPath string, force, recursive bool) error {
	if gfarmPath == "" {
		return fmt.Errorf("gfarm-path is required")
	}
	params := url.Values{}
	if force {
		params.Set("force", strconv.FormatBool(true))
	}
	if recursive {
		params.Set("recursive", strconv.FormatBool(true))
	}
	u := c.generateURL("file", gfarmPath, params)
	return c.makeHTTPRequest("DELETE", u, nil, nil, "", "")
}

func (c *Client) cmdRmdir(gfarmPath string) error {
	if gfarmPath == "" {
		return fmt.Errorf("gfarm-path is required")
	}
	u := c.generateURL("dir", gfarmPath, nil)
	return c.makeHTTPRequest("DELETE", u, nil, nil, "", "")
}

func (c *Client) cmdChmod(mode, gfarmPath string) error {
	if mode == "" || gfarmPath == "" {
		return fmt.Errorf("both mode and Gfarm-path are required")
	}
	u := c.generateURL("attr", gfarmPath, nil)
	data := map[string]string{"Mode": mode}
	return c.makeHTTPRequest("PUT", u, data, nil, "", "")
}

func (c *Client) cmdStat(gfarmPath string, check_sum, check_symlink bool) error {
	if gfarmPath == "" {
		return fmt.Errorf("gfarm-path is required")
	}
	params := url.Values{}
	if check_sum {
		params.Set("check_sum", strconv.FormatBool(true))
	}
	if check_symlink {
		params.Set("check_symlink", strconv.FormatBool(true))
	}
	u := c.generateURL("attr", gfarmPath, params)
	return c.makeHTTPRequest("GET", u, nil, nil, "", "")
}

func (c *Client) cmdMv(srcPath, dstPath string) error {
	if srcPath == "" || dstPath == "" {
		return fmt.Errorf("both source and destination paths are required")
	}
	u := c.generateURL("move", "", nil)
	data := map[string]string{"source": srcPath, "destination": dstPath}
	return c.makeHTTPRequest("POST", u, data, nil, "", "")
}

func (c *Client) cmdWhoami() error {
	u := c.generateURL("conf/me", "", nil)
	return c.makeHTTPRequest("GET", u, nil, nil, "", "")
}

func (c *Client) cmdCopy(srcPath, dstPath string) error {
	if srcPath == "" || dstPath == "" {
		return fmt.Errorf("both source and destination paths are required")
	}
	u := c.generateURL("copy", "", nil)
	data := map[string]string{"source": srcPath, "destination": dstPath}
	return c.makeHTTPRequest("PUT", u, data, nil, "", "")
}

func (c *Client) cmdLn(srcPath, dstPath string, symlink bool) error {
	if srcPath == "" || dstPath == "" {
		return fmt.Errorf("both source and destination paths are required")
	}
	params := url.Values{}
	params.Set("symlink", strconv.FormatBool(symlink))
	u := c.generateURL("symlink", "", params)
	data := map[string]string{"source": srcPath, "destination": dstPath}
	return c.makeHTTPRequest("POST", u, data, nil, "", "")
}

func (c *Client) cmdTar(command, outdir, basedir string, source, options []string) error {
	u := c.generateURL("gfptar", "", nil)
	data := map[string]any{
		"command": command,
		"basedir": basedir,
		"source":  source,
		"outdir":  outdir,
		"options": options,
	}
	return c.makeHTTPRequest("POST", u, data, nil, "", "")
}

func (c *Client) cmdGetfacl(gfarmPath string) error {
	if gfarmPath == "" {
		return fmt.Errorf("gfarm-path is required")
	}
	u := c.generateURL("acl", gfarmPath, nil)
	return c.makeHTTPRequest("GET", u, nil, nil, "", "")
}

func (c *Client) cmdSetfacl(gfarmPath, aclText string) error {
	if gfarmPath == "" {
		return fmt.Errorf("gfarm-path is required")
	}
	u := c.generateURL("acl", gfarmPath, nil)

	data, err := parseAclText(aclText)
	if err != nil {
		return fmt.Errorf("parse ACL: %w", err)
	}

	return c.makeHTTPRequest("PUT", u, data, nil, "", "")
}

func parseAclText(text string) (map[string]any, error) {
	entries := make([]map[string]any, 0, 8)
	sc := bufio.NewScanner(strings.NewReader(text))

	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		isDefault := false
		if strings.HasPrefix(line, "default:") {
			isDefault = true
			line = strings.TrimPrefix(line, "default:")
		} else if strings.HasPrefix(line, "d:") {
			isDefault = true
			line = strings.TrimPrefix(line, "d:")
		}

		// Expect "<type>:<name>:<perms>"
		parts := strings.SplitN(line, ":", 3)
		if len(parts) != 3 {
			return nil, fmt.Errorf("invalid ACL line (need type:name:perms): %q", line)
		}

		aclType := strings.TrimSpace(parts[0])
		name := strings.TrimSpace(parts[1])
		perms := strings.TrimSpace(parts[2])

		r, w, x, err := parsePermBools(perms) // "rwx" / "r-x" etc.
		if err != nil {
			return nil, fmt.Errorf("invalid perms in %q: %w", line, err)
		}

		entry := map[string]any{
			"acl_type":   aclType,
			"acl_name":   nil, // null by default
			"acl_perms":  map[string]bool{"r": r, "w": w, "x": x},
			"is_default": isDefault,
		}
		if name != "" {
			entry["acl_name"] = name
		}

		entries = append(entries, entry)
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}

	return map[string]any{"acl": entries}, nil
}

func parsePermBools(s string) (bool, bool, bool, error) {
	if len(s) != 3 {
		return false, false, false, fmt.Errorf("perms must be 3 chars (r/-)(w/-)(x/-), got %q", s)
	}
	// basic validation
	if s[0] != 'r' && s[0] != '-' {
		return false, false, false, fmt.Errorf("bad read flag: %q", s[0])
	}
	if s[1] != 'w' && s[1] != '-' {
		return false, false, false, fmt.Errorf("bad write flag: %q", s[1])
	}
	if s[2] != 'x' && s[2] != '-' {
		return false, false, false, fmt.Errorf("bad exec flag: %q", s[2])
	}
	return s[0] == 'r', s[1] == 'w', s[2] == 'x', nil
}

func (c *Client) cmdUsers(long_format bool) error {
	params := url.Values{}
	if long_format {
		params.Set("long_format", strconv.FormatBool(true))
	}
	u := c.generateURL("users", "", params)
	return c.makeHTTPRequest("GET", u, nil, nil, "", "")
}

func (c *Client) cmdGroups(long_format bool) error {
	params := url.Values{}
	if long_format {
		params.Set("long_format", strconv.FormatBool(true))
	}
	u := c.generateURL("groups", "", params)
	return c.makeHTTPRequest("GET", u, nil, nil, "", "")
}

func (c *Client) cmdUserInfo() error {
	u := c.generateURL("user_info", "", nil)
	return c.makeHTTPRequest("GET", u, nil, nil, "", "")
}

func (c *Client) cmdZip(paths []string, localPath string) error {
	if len(paths) == 0 {
		return fmt.Errorf("zip requires at least one Gfarm path")
	}

	data := url.Values{}
	for _, p := range paths {
		data.Add("paths", p)
	}

	u := c.generateURL("zip", "", nil)

	return c.makeHTTPRequest("POST", u, data, nil, localPath, "")
}
