/**
 * 백엔드 API 클라이언트 설정
 */

const API_BASE_URL = import.meta.env.VITE_BACKEND_API_URL || 'https://api.aubl.club';

export interface ApiError {
  message: string;
  status: number;
  data?: unknown;
}

/**
 * API 요청 wrapper 함수
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error: ApiError = {
        message: errorData.message || `HTTP error! status: ${response.status}`,
        status: response.status,
        data: errorData,
      };
      throw error;
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    if ((error as ApiError).status) {
      throw error;
    }
    throw {
      message: '네트워크 요청 실패',
      status: 0,
      data: error,
    } as ApiError;
  }
}

export const api = {
  get: <T>(endpoint: string, headers?: HeadersInit) =>
    apiRequest<T>(endpoint, { method: 'GET', headers }),

  post: <T>(endpoint: string, body?: unknown, headers?: HeadersInit) =>
    apiRequest<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      headers,
    }),

  put: <T>(endpoint: string, body?: unknown, headers?: HeadersInit) =>
    apiRequest<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      headers,
    }),

  delete: <T>(endpoint: string, headers?: HeadersInit) =>
    apiRequest<T>(endpoint, { method: 'DELETE', headers }),
};

export { API_BASE_URL };
