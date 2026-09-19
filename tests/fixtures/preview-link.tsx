import React from 'react';
export default function PreviewLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} onClick={event => event.preventDefault()} />;
}
