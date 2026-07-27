/* =========================================================
   api-config.js — Public REST API configuration.
   ---------------------------------------------------------
   SECURITY: this file holds NO secrets. Only the backend base
   URL lives here. All sensitive keys live ONLY in the
   backend environment variables.

   To enable REST API mode, set `baseUrl` to your deployed
   backend API URL including /api. Leave blank/undefined to keep
   the client in "demo mode" (localStorage fallback).
   ========================================================= */
window.MGApiConfig = {
  // Base URL of the REST API (with /api)
  // e.g. "http://localhost:8080/api" or "https://api.marshal-hotel.com/api"
  baseUrl: "http://localhost:8080/api"
};