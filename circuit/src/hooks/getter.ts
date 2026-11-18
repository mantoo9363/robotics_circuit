// hooks/useSetter.ts
'use client'; // Required in Next.js App Router for Client Components

import axios, { AxiosError } from "axios";
import { useCallback } from "react";
import { useAuth } from "../provider/AuthProvider";
import { toast } from "react-toastify";
import { getApiErrorMessage, isAuthenticationFailure } from "@cs/lib/auth-client";

// 1. Define the structure of the incoming arguments for a GET request
interface SetterPayload {
  url: string;
  bodyData?: Record<string, any>; // maps to query string parameters (e.g. ?key=value)
}

// 2. Define the expected backend error structure
interface ApiErrorResponse {
  msg?: string;
  message?: string;
  error?: string;
}

export const useGetter = () => {
  const { token, logout } = useAuth();


  const callGetter = useCallback(async <T = any>(value: SetterPayload): Promise<T | false> => {
    try {
      const res = await axios.get<T>(value.url, {
        headers: {
          "x-api-key": "e3c13629562f577aa37635ffc824dd421641a988dbb562bd27a1d1ca7a6ec962fb79cd4262e2460905c7789340c9c1303c07f51a4a9b7a995816a61926ba0c34",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        // If bodyData is not provided, fallback to undefined so axios ignores the param block
        params: value?.bodyData || undefined, 
      });

      return res.data;
    } catch (error) {
      console.error("API Error:", error);

      // 3. Type-safe handling of Axios errors
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<ApiErrorResponse>;
        const errorMessage = getApiErrorMessage(axiosError.response?.data, "Something went wrong");

        if (isAuthenticationFailure(axiosError.response?.status, axiosError.response?.data)) {
          toast.error(errorMessage);
          logout();
          return false;
        }
        
        if (errorMessage) {
          toast.error(errorMessage);
        }
      } else {
        toast.error("An unexpected network error occurred");
      }

      return false;
    }
  }, [logout, token]);

  return { callGetter };
};
