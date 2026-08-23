import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import { ToastProvider } from '../context/ToastContext.jsx';
import { ToastViewport } from '../components/ui/ToastViewport.jsx';
import { router } from './router.jsx';

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={router} />
        <ToastViewport />
      </ToastProvider>
    </AuthProvider>
  );
}
