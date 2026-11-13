package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Encode each path segment but keep slashes as separators.
func encodePath(p string) string {
	p = strings.TrimPrefix(p, "/")
	segs := strings.Split(p, "/")
	for i, s := range segs {
		segs[i] = url.PathEscape(s)
	}
	return strings.Join(segs, "/")
}

func formatByteData(b []byte) string {
	var v any
	if json.Unmarshal(b, &v) == nil {
		out, _ := json.MarshalIndent(v, "", "  ")
		return string(out)
	}
	return string(b)
}

func createRequest(ctx context.Context, method, requestURL string, body io.Reader) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, requestURL, body)
	if err != nil {
		return nil, fmt.Errorf("new request: %w", err)
	}

	authHeaders, err := GetAuthHeaders()
	if err != nil {
		return nil, err
	}

	for k, v := range authHeaders {
		req.Header.Set(k, v)
	}
	return req, nil
}

func handleResponse(resp *http.Response, outputFile string) error {
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		eb, _ := io.ReadAll(resp.Body)
		return &HTTPError{
			StatusCode: resp.StatusCode,
			Message:    formatByteData(eb),
		}
	}

	if outputFile == "" {
		data, err := io.ReadAll(resp.Body)
		if err != nil {
			return fmt.Errorf("read response: %w", err)
		}
		fmt.Print(formatByteData(data))
		return nil
	}

	if outputFile == "-" {
		if _, err := io.Copy(os.Stdout, resp.Body); err != nil {
			return fmt.Errorf("stream write: %w", err)
		}
		return nil
	}

	if d := filepath.Dir(outputFile); d != "" && d != "." {
		if err := os.MkdirAll(d, DefaultDirMode); err != nil {
			return fmt.Errorf("create directory %s: %w", d, err)
		}
	}

	f, err := os.OpenFile(outputFile, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, DefaultFileMode)
	if err != nil {
		return fmt.Errorf("open %s: %w", outputFile, err)
	}

	defer f.Close()
	if _, err := io.Copy(f, resp.Body); err != nil {
		return fmt.Errorf("stream write: %w", err)
	}

	if lm := resp.Header.Get("Last-Modified"); lm != "" {
		if t, err := time.Parse(time.RFC1123, lm); err == nil {
			_ = os.Chtimes(outputFile, t, t)
		}
	}

	return nil
}

func prepareRequestBody(data any, uploadFile string, headers map[string]string) (io.Reader, func(), error) {
	if uploadFile != "" {
		return prepareUploadBody(uploadFile, headers)
	}

	switch v := data.(type) {
	case url.Values:
		return prepareFormBody(v, headers)

	case nil:
		return nil, func() {}, nil

	default:
		return prepareJSONBody(v, headers)
	}

}

func prepareUploadBody(uploadFile string, headers map[string]string) (io.Reader, func(), error) {
	headers["Content-Type"] = "application/octet-stream"
	if uploadFile == "-" {
		return os.Stdin, func() {}, nil
	}

	f, err := os.Open(uploadFile)
	if err != nil {
		return nil, func() {}, fmt.Errorf("open %s: %w", uploadFile, err)
	}
	if st, err := f.Stat(); err == nil {
		headers["X-File-Timestamp"] = strconv.FormatInt(st.ModTime().Unix(), 10)
	}
	return f, func() { _ = f.Close() }, nil
}

func prepareJSONBody(data any, headers map[string]string) (io.Reader, func(), error) {
	raw, err := json.Marshal(data)
	if err != nil {
		return nil, func() {}, fmt.Errorf("marshal json: %w", err)
	}
	headers["Content-Type"] = "application/json"
	return bytes.NewReader(raw), func() {}, nil
}

func prepareFormBody(data url.Values, headers map[string]string) (io.Reader, func(), error) {
	headers["Content-Type"] = "application/x-www-form-urlencoded"
	return strings.NewReader(data.Encode()), func() {}, nil
}
