import qrcode from "qrcode";

export const generateQr = async (id) => {
  const qr = await qrcode.toDataURL(id);
  return qr;
};
