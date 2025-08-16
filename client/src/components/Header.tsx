import logoPath from "@assets/logo_1755332058201.webp";

interface HeaderProps {
  user?: {
    parent: {
      name: string;
    };
  };
  students?: Array<{ name: string }>;
  onLogout?: () => void;
}

export default function Header({ user, students, onLogout }: HeaderProps) {
  return (
    <div className="header-section">
      <div className="container">
        <div className="d-flex justify-content-between align-items-center">
          <div className="header-brand">
            <img src={logoPath} alt="Tutoring Club Logo" className="header-logo" />
            <h1 className="header-title">Tutoring Club Parent Portal</h1>
          </div>
          {user && (
            <div className="text-end">
              <div className="text-dark mb-1">
                <strong>Welcome, {user.parent.name}!</strong>
              </div>
              {students && students.length > 0 && (
                <div className="text-muted small mb-2">
                  Students: {students.map(s => s.name).join(', ')}
                </div>
              )}
              {onLogout && (
                <button onClick={onLogout} className="btn btn-outline-primary btn-sm">
                  Logout
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}