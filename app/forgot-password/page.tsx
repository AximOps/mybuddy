import { ForgotForm } from '@/components/ForgotForm';

export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return <ForgotForm mailConfigured={!!(process.env.RESEND_API_KEY && process.env.MAIL_FROM)} />;
}
