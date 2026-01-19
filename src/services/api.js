import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Request interceptor - Add token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('AUTH_TOKEN');
        
        console.log('🔍 API Request:', config.url);
        console.log('🔑 Token exists:', !!token);
        
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor - Handle errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            console.log('❌ 401 Unauthorized - Token invalid');
            localStorage.removeItem('AUTH_TOKEN');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default api;