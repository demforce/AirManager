import { signOut } from '@/server/auth/auth';
import { Button } from '@/components/ui/button';

type LogoutButtonProps = {
  locale: string;
  label: string;
};

/**
 * `logoutAction` extracted from `dashboard/page.tsx` (story 12.2, AC 5) into
 * a shared component so the topbar can render it on every dashboard page,
 * not just the home. Same server action body as before, byte-identical
 * behavior (`signOut({ redirectTo: '/${locale}/login' })`).
 */
export function LogoutButton({ locale, label }: LogoutButtonProps) {
  async function logoutAction() {
    'use server';
    await signOut({ redirectTo: `/${locale}/login` });
  }

  return (
    <form action={logoutAction}>
      <Button variant="outline" type="submit">
        {label}
      </Button>
    </form>
  );
}
