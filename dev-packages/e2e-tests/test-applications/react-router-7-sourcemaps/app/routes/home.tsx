export function meta() {
  return [{ title: 'Sourcemaps Test' }];
}

export default function Home() {
  const message = `hello from react-router sourcemaps test at ${new Date().toISOString()}`;
  return <h1>{message}</h1>;
}
