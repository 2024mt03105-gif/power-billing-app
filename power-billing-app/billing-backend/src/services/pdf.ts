import PDFDocument from "pdfkit";
import { BillDetail, Meter } from "../domain.js";
import { Readable } from "stream";

const formatReading = (reading: BillDetail["currentReading"]): string => {
  if (!reading) {
    return "n/a";
  }

  return `${reading.kwh} kWh (${reading.timestamp})`;
};

export const buildBillPdf = (bill: BillDetail, meter: Meter): Readable => {
  const doc = new PDFDocument({ margin: 36, size: "A4" });
  const stream = doc as unknown as Readable;

  doc.fontSize(16).text("Electricity Bill", { align: "center" });
  doc.moveDown(0.6);

  doc.fontSize(11);
  doc.text("Electricity Board Name: Telangana Smart Power Distribution Board");
  doc.text(`Customer Name: ${meter.customerId}`);
  doc.text(`Meter Number: ${meter.id}`);
  doc.text(`Billing Period: ${bill.month}`);
  doc.text(`Previous Reading: ${formatReading(bill.previousReading)}`);
  doc.text(`Current Reading: ${formatReading(bill.currentReading)}`);
  doc.text(`Units Consumed: ${bill.totalKwh} kWh`);
  doc.moveDown(0.8);

  doc.fontSize(13).text("Slab Calculation");
  doc.moveDown(0.3);
  doc.fontSize(10);

  bill.slabs.forEach((slab, idx) => {
    const range = slab.upto === null ? "Above" : `Up to ${slab.upto}`;
    doc.text(`Slab ${idx + 1}: ${range} | Rate ${slab.rate}/kWh | Units ${slab.units} | Charge ${slab.charge}`);
  });

  doc.moveDown(0.8);
  doc.fontSize(11);
  doc.text(`Fixed Charges: ${bill.fixedCharge}`);
  doc.text(`Taxes: ${bill.taxes}`);
  doc.text(`Total Amount: ${bill.totalAmount}`);
  doc.text(`Due Date: ${bill.dueDate}`);

  doc.end();
  return stream;
};