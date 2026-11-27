// Phone number helpers shared by user profiles and hospital contact details.
// Numbers are stored in international (E.164) format, e.g. +2348031234567.

export const E164 = /^\+[1-9]\d{6,14}$/;

// Spaces, dashes and brackets are removed. Nigerian local numbers
// (08031234567) and numbers starting 234 are converted to +234. A leading 00 is
// read as "+". With allowLandline, shorter Nigerian numbers such as
// 01 234 5678 are converted too (hospitals often publish landlines).
export const normalizePhone = (value, { allowLandline = false } = {}) => {
  let phone = String(value).replace(/[\s().-]/g, "");

  const local = allowLandline ? /^0\d{8,10}$/ : /^0\d{10}$/;
  const withCountryCode = allowLandline ? /^234\d{8,10}$/ : /^234\d{10}$/;

  if (local.test(phone)) phone = "+234" + phone.slice(1);
  else if (withCountryCode.test(phone)) phone = "+" + phone;
  else if (phone.startsWith("00")) phone = "+" + phone.slice(2);

  return phone;
};