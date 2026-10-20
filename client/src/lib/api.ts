
type ApiError = {
  message?: string;
};

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const sendRequest = () => {
    const headers = new Headers(options.headers);

    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return fetch(`/api/backend${endpoint}`, {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store",
    });
  };

  let response = await sendRequest();

  const skipRefresh = [
    "/auth/login",
    "/auth/signup",
    "/auth/refresh",
    "/auth/forgot-password",
    "/auth/reset-password",
  ].includes(endpoint);

  // Attempt one refresh when a protected request
  // receives an expired-access-token response.
  if (response.status === 401 && !skipRefresh) {
    const refreshResponse = await fetch(
      "/api/backend/auth/refresh",
      {
        method: "POST",
        credentials: "include",
      }
    );

    if (refreshResponse.ok) {
      response = await sendRequest();
    }
  }

  const data = (await response
    .json()
    .catch(() => ({}))) as T & ApiError;

  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}
