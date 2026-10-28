// Shared conventional financial-field classification. Specifications belong in
// categories; prices/taxes/budgets belong in permission-protected workflow fields.
export const financialAttribute=key=>/(^|_)(cost|price|amount|currency|tax|invoice|payment|salary|budget|charge)(_|$)/i.test(key);
export const specificationAttributes=attributes=>Object.fromEntries(Object.entries(attributes).filter(([key])=>!financialAttribute(key)));
