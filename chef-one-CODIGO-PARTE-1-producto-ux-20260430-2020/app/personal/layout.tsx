import StaffPersonalShell from '@/components/staff/StaffPersonalShell';

export default function PersonalLayout({ children }: { children: React.ReactNode }) {
  return <StaffPersonalShell>{children}</StaffPersonalShell>;
}
