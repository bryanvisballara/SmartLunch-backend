import api from '../lib/api';

export const login = (data) => {
	const usernameOrEmail = String(data?.username || data?.email || '').trim().toLowerCase();
	return api.post('/auth/login', {
		...data,
		username: usernameOrEmail,
		email: usernameOrEmail,
	});
};
export const register = (data) => api.post('/auth/register', data);
export const sendRegisterEmailCode = (data) => api.post('/auth/register/email/send-code', data);
export const verifyRegisterEmailCode = (data) => api.post('/auth/register/email/verify-code', data);
export const completeRegister = (data) => api.post('/auth/register/complete', data);
export const sendForgotPasswordCode = (data) => api.post('/auth/password/forgot/send-code', data);
export const verifyForgotPasswordCode = (data) => api.post('/auth/password/forgot/verify-code', data);
export const resetForgotPassword = (data) => api.post('/auth/password/forgot/reset', data);
export const me = () => api.get('/auth/me');
export const getBiometricRegistrationOptions = () => api.post('/auth/biometric/register/options');
export const verifyBiometricRegistration = (data) => api.post('/auth/biometric/register/verify', data);
export const getBiometricLoginOptions = (data) => api.post('/auth/biometric/login/options', data);
export const verifyBiometricLogin = (data) => api.post('/auth/biometric/login/verify', data);
