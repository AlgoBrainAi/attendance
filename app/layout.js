import './globals.css';

export const metadata = {
  title: 'Attendance Management System',
  description: 'Mark attendance and calculate salaries',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
