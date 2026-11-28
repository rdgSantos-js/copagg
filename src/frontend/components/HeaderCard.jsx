import { useId } from "react";
import CountryFlag from "./CountryFlag.jsx";

function HeaderCard({
  name,
  eyebrow,
  subtitle,
  date,
  prizePool,
  status,
  statusType = "neutral",
  imageUrl,
  imageFallback,
  countryName,
  countryCode,
  socialLinks = [],
}) {
  const headingId = useId();

  return (
    <section className={`header-card${status ? " header-card-with-status" : ""}`} aria-labelledby={headingId}>
      <div className="header-card-image">
        {imageUrl ? (
          <img src={imageUrl} alt="" />
        ) : (
          <span className="header-card-image-fallback" aria-hidden="true">
            {imageFallback || eyebrow?.slice(0, 1)}
          </span>
        )}
      </div>
      <div className="header-card-info">
        {eyebrow && <span className="header-card-eyebrow">{eyebrow}</span>}
        <div className="header-card-title-row">
          <h3 id={headingId}>{name}</h3>
          {countryName && (
            <span className="header-card-country">
              {countryName}
              <CountryFlag countryCode={countryCode} countryName="" />
            </span>
          )}
        </div>
        {subtitle && <span className="header-card-subtitle">{subtitle}</span>}
        {(date || prizePool) && (
          <div className="header-card-details">
            {date && <span className="header-card-date">{date}</span>}
            {prizePool && <span className="header-card-prizepool">{prizePool}</span>}
          </div>
        )}
        {socialLinks.length > 0 && (
          <nav className="header-card-socials" aria-label={`Redes sociais de ${name}`}>
            {socialLinks.map((social) => (
              <a
                className={`social-link social-link-${social.platform}`}
                href={social.url}
                key={social.label}
                rel="noreferrer"
                target="_blank"
              >
                {social.label}
                <span aria-hidden="true">↗</span>
              </a>
            ))}
          </nav>
        )}
      </div>
      {status && (
        <span className={`header-card-status status-badge status-${statusType}`}>
          {statusType === "live" && <span className="live-dot" />}
          {status}
        </span>
      )}
    </section>
  );
}

export default HeaderCard;
