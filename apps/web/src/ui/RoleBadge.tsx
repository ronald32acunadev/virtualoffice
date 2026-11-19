export function RoleBadge({ role }: { role: string | null }) {
  if (!role) return null;
  return (
    <span className="role-badge" title={`Specialist: ${role}`}>
      {role}
    </span>
  );
}
