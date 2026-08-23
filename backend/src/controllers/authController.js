import * as AuthService from '../services/AuthService.js';

export async function register(req, res, next) {
  try {
    const { user, token } = await AuthService.registerWithPassword(req.body);
    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { user, token } = await AuthService.loginWithPassword(req.body);
    res.status(200).json({ user, token });
  } catch (err) {
    next(err);
  }
}

export async function googleLogin(req, res, next) {
  try {
    const { user, token } = await AuthService.loginWithGoogle(req.body);
    res.status(200).json({ user, token });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    const user = await AuthService.getProfile(req.user.id);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req, res, next) {
  try {
    const user = await AuthService.updateProfile(req.user.id, req.body);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}
