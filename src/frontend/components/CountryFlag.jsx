function CountryFlag({ countryCode, countryName }) {
  if (typeof countryCode !== "string" || !/^[a-z]{2}$/i.test(countryCode)) {
    return null;
  }

  const code = countryCode.toUpperCase();

  return (
    <img
      src={`https://flagsapi.com/${code}/flat/24.png`}
      alt={countryName ?? code}
      width="14"
      height="14"
    />
  );
}

export default CountryFlag;
