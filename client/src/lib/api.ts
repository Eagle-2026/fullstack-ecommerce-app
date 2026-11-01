type ApiErrorBody = {
  message?: string;
};

// Keep the HTTP status so the frontend can
// distinguish 401 from server/network errors.
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

// Share a single refresh request across API calls.
let refreshPromise: Promise<boolean> | null = null;

// Do not refresh authentication during logout.
let logoutInProgress = false;

const noRefreshEndpoints = new Set([
  "/auth/login",
  "/auth/signup",
  "/auth/logout",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
]);

// ======================================
// REFRESH ACCESS TOKEN ONCE
// ======================================
function refreshAccessToken(): Promise<boolean> {
  if (logoutInProgress) {
    return Promise.resolve(false);
  }

  if (!refreshPromise) {
    refreshPromise = fetch("/api/backend/auth/refresh", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

// ======================================
// MAIN API HELPER
// ======================================
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const endpointPath = endpoint.split("?")[0];

  const isLogout = endpointPath === "/auth/logout";

  // Wait for any earlier refresh before logging out.
  if (isLogout) {
    logoutInProgress = true;

    if (refreshPromise) {
      await refreshPromise;
    }
  }

  const sendRequest = () => {
    const headers = new Headers(options.headers);

    // Set JSON content type for JSON string bodies.
    if (typeof options.body === "string" && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return fetch(`/api/backend${endpoint}`, {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store",
    });
  };

  try {
    let response = await sendRequest();

    // If a protected request returns 401,
    // try refreshing authentication once.
    if (
      response.status === 401 &&
      !noRefreshEndpoints.has(endpointPath) &&
      !logoutInProgress
    ) {
      const refreshed = await refreshAccessToken();

      if (refreshed && !logoutInProgress) {
        response = await sendRequest();
      }
    }

    const parsed: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const errorBody: ApiErrorBody =
        parsed !== null && typeof parsed === "object"
          ? (parsed as ApiErrorBody)
          : {};

      throw new ApiRequestError(
        typeof errorBody.message === "string"
          ? errorBody.message
          : "Request failed",
        response.status,
      );
    }

    // Notify interested components after login
    // or registration so they recheck the user.
    if (endpointPath === "/auth/login" || endpointPath === "/auth/signup") {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("ecom-auth-changed"));
      }
    }

    return parsed as T;
  } finally {
    if (isLogout) {
      logoutInProgress = false;
    }
  }
}
