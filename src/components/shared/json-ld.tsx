/**
 * Renders a schema.org JSON-LD block.
 *
 * Server component on purpose: the markup ships in the initial HTML so
 * crawlers that do not execute JavaScript still see it.
 *
 * The payload is our own catalog data serialised with JSON.stringify, never
 * user input, so the only escaping concern is a literal "</script>" sequence
 * inside a string closing the tag early — hence the `<` replacement below.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
  );
}
