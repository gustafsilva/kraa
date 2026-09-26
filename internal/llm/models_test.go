package llm

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestListModels_ReturnsSortedUniqueIDs(t *testing.T) {
	var gotPath, gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotAuth = r.URL.Path, r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"object":"list","data":[
			{"id":"llama3.2:latest"},{"id":"gpt-oss:120b-cloud"},{"id":""},{"id":"llama3.2:latest"}]}`))
	}))
	defer server.Close()

	got, err := ListModels(context.Background(), server.URL+"/v1/", "sk-x")
	if err != nil {
		t.Fatalf("ListModels() error = %v", err)
	}
	want := []string{"gpt-oss:120b-cloud", "llama3.2:latest"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
	if gotPath != "/v1/models" {
		t.Errorf("path = %q, want /v1/models", gotPath)
	}
	if gotAuth != "Bearer sk-x" {
		t.Errorf("Authorization = %q", gotAuth)
	}
}

func TestListModels_NoAuthHeaderWithoutAPIKey(t *testing.T) {
	var gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer server.Close()

	got, err := ListModels(context.Background(), server.URL, "")
	if err != nil {
		t.Fatalf("ListModels() error = %v", err)
	}
	if len(got) != 0 || gotAuth != "" {
		t.Errorf("got %v, auth %q", got, gotAuth)
	}
}

func TestListModels_HTTPErrorReturnsAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"invalid api key"}}`))
	}))
	defer server.Close()

	_, err := ListModels(context.Background(), server.URL, "bad")
	var apiErr *APIError
	if !errors.As(err, &apiErr) || apiErr.Status != http.StatusUnauthorized || apiErr.Message != "invalid api key" {
		t.Fatalf("err = %v, want *APIError 401 'invalid api key'", err)
	}
}

func TestListModels_UnreachableServer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	url := server.URL
	server.Close()

	_, err := ListModels(context.Background(), url, "")
	if !errors.Is(err, ErrUnreachable) {
		t.Fatalf("err = %v, want ErrUnreachable", err)
	}
}

func TestListModels_InvalidJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`<html>not json</html>`))
	}))
	defer server.Close()

	if _, err := ListModels(context.Background(), server.URL, ""); err == nil {
		t.Fatal("ListModels() error = nil, want parse error")
	}
}
