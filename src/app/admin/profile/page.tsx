import { ProfileClient } from '@/components/account/profile-client';

export const metadata = { title: 'My profile' };

export default function ProfilePage() {
  return <ProfileClient description="Your administrator account details and password." />;
}
