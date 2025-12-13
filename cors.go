package main

import "net/http"

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		setCORSHeaders(w, r)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

func setCORSHeaders(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "*")
	w.Header().Set("Access-Control-Allow-Headers", "*")
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Expose-Headers", "*")
	w.Header().Set("Cross-Origin-Resource-Policy", "cross-origin")
	w.Header().Set("Cross-Origin-Embedder-Policy", "unsafe-none")
	w.Header().Set("Cross-Origin-Opener-Policy", "unsafe-none")
}

type corsResponseWriter struct {
	http.ResponseWriter
	written bool
}

func (cw *corsResponseWriter) WriteHeader(code int) {
	if !cw.written {
		setCORSHeaders(cw.ResponseWriter, nil)
		contentType := cw.ResponseWriter.Header().Get("Content-Type")
		if needsJSContentType(contentType) {
			cw.ResponseWriter.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		}
		cw.written = true
	}
	cw.ResponseWriter.WriteHeader(code)
}

func (cw *corsResponseWriter) Write(b []byte) (int, error) {
	if !cw.written {
		cw.WriteHeader(http.StatusOK)
	}
	return cw.ResponseWriter.Write(b)
}

func needsJSContentType(contentType string) bool {
	return contentType == "" || contentType == "text/plain" ||
		contentType == "text/javascript" || contentType == "text/javascript; charset=utf-8"
}

