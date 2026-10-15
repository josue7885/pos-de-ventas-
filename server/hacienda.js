// Skeleton for Hacienda connector (El Salvador)
// This module provides a placeholder for real integration where:
// - XML invoices are signed with the company's certificate
// - Sent to Ministerio de Hacienda endpoints
// - Responses (authorization, status) are handled and stored

// Real implementation requires credentials (certificates, keys), endpoint URLs, and rules.
// Keep this file as a starting point; it currently exports stub functions.

module.exports = {
  prepareInvoiceXml: function(invoice) {
    // invoice: { id, number, xml }
    // Return the XML ready to be signed/sent
    return invoice.xml;
  },

  signXml: async function(xml, certPath, keyPath, passphrase) {
    // Placeholder: implement XML digital signature (XAdES/PKCS#7) as required by Hacienda
    throw new Error('Not implemented: signXml');
  },

  sendToHacienda: async function(signedXml, config) {
    // Placeholder: POST signed XML to Hacienda endpoints and return response
    return { status: 'PENDING', message: 'Conector no configurado' };
  }
};