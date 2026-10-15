import { ProfileClient } from '@/components/account/profile-client';

export const metadata = { title: 'My profile' };

export default function ProfilePage() {
  return <ProfileClient description="Your guardian account details and password." />;
}
