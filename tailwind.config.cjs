module.exports = {
  content: ['./public/index.html', './public/panel.js', './public/studio.js', './public/services.js'],
  darkMode: 'class',
  theme: { extend: { fontFamily: { sans: ['Vazirmatn', 'ui-sans-serif', 'system-ui', 'Tahoma', 'sans-serif'] }, colors: { brand: { 400: '#38bdf8', 500: '#2aabee', 600: '#229ed9', 700: '#1c86b8' } }, keyframes: { fadeIn: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } } }, animation: { fadeIn: 'fadeIn .25s ease-out' } } },
};
