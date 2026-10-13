import { useEffect, useState } from 'react';

export default function useTheme() {
  const [isDarkTheme, setIsDarkTheme] = useState(() => localStorage.getItem('dark-theme') === 'true');
  useEffect(() => { document.body.classList.toggle('dark-theme', isDarkTheme); }, [isDarkTheme]);
  const toggleDarkTheme = () => setIsDarkTheme((previous) => {
    const next = !previous;
    localStorage.setItem('dark-theme', String(next));
    return next;
  });
  return { isDarkTheme, toggleDarkTheme };
}
