export function focusHelpSection(document: Document, section: string): void {
  if (!['about', 'contact', 'help'].includes(section)) return;
  const heading = document.getElementById(section);
  if (!heading) return;
  const navbar = document.querySelector('.site-navbar');
  heading.style.scrollMarginTop = ((navbar?.getBoundingClientRect().height || 0) + 20) + 'px';
  heading.focus({preventScroll: true});
  heading.scrollIntoView({block: 'start', behavior: 'auto'});
}
