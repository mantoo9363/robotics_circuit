'use client'; 
import axios, { AxiosError } from "axios";
import { useCallback } from "react";
import { useAuth } from "../provider/AuthProvider";
import { toast } from "react-toastify";
import { getApiErrorMessage, isAuthenticationFailure } from "@cs/lib/auth-client";

interface SetterRowPayload {
  url: string;
  bodyData: Record<string, any>; 
}

interface ApiErrorResponse {
  msg?: string;
  message?: string;
  error?: string;
}

export const useSetterRow = () => {
  const { token, logout } = useAuth();
  const callSetterRow = useCallback(async <T = any>(value: SetterRowPayload): Promise<T | false> => {
    try {
      const res = await axios.post<T>(value.url, value.bodyData, {
        headers: {
          "x-api-key": "e3c13629562f577aa37635ffc824dd421641a988dbb562bd27a1d1ca7a6ec962fb79cd4262e2460905c7789340c9c1303c07f51a4a9b7a995816a61926ba0c34",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        }
      });
      return res.data;
    } catch (error) {
      console.error("API Error:", error);
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<ApiErrorResponse>;
        const errorMessage = getApiErrorMessage(axiosError.response?.data, "Something went wrong");
        
        console.log(errorMessage);
        if (isAuthenticationFailure(axiosError.response?.status, axiosError.response?.data)) {
          toast.error(errorMessage);
          logout();
          return false;
        }

        toast.error(errorMessage);
      } else {
        toast.error("An unexpected error occurred");
      }
      
      return false;
    }
  }, [logout, token]);

  return { callSetterRow };
};
