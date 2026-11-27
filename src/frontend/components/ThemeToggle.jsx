import Icon from "./Icon.jsx";

function ThemeToggle({ theme, onToggle }) {
  const nextTheme = theme === "dark" ? "light" : "dark";
  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={onToggle}
      aria-label={`Ativar modo ${nextTheme === "dark" ? "noturno" : "diurno"}`}
      title={`Ativar modo ${nextTheme === "dark" ? "noturno" : "diurno"}`}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} />
      <span>{theme === "dark" ? "Modo dia" : "Modo noite"}</span>
    </button>
  );
}

export default ThemeToggle;
