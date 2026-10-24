/** Parse req[source] with a zod schema; the parsed (coerced, stripped) value replaces it. */
export const validate =
  (schema, source = 'body') =>
  (req, res, next) => {
    const parsed = schema.parse(req[source] ?? {});
    // Express 5 makes req.query a getter, so store parsed query separately.
    if (source === 'query') req.validatedQuery = parsed;
    else req[source] = parsed;
    next();
  };
