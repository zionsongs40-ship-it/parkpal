'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const publicVendor = path.join(root, 'public', 'vendor');

function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

const leaflet = path.join(root, 'node_modules', 'leaflet', 'dist');
const protomaps = path.join(root, 'node_modules', 'protomaps-leaflet', 'dist');
const fontAwesome = path.join(root, 'node_modules', '@fortawesome', 'fontawesome-free');

copy(path.join(leaflet, 'leaflet.css'), path.join(publicVendor, 'leaflet', 'leaflet.css'));
copy(path.join(leaflet, 'leaflet.js'), path.join(publicVendor, 'leaflet', 'leaflet.js'));
copy(path.join(leaflet, 'images'), path.join(publicVendor, 'leaflet', 'images'));
copy(path.join(protomaps, 'protomaps-leaflet.js'), path.join(publicVendor, 'protomaps', 'protomaps-leaflet.js'));
copy(path.join(fontAwesome, 'css', 'all.min.css'), path.join(publicVendor, 'fontawesome', 'all.min.css'));
copy(path.join(fontAwesome, 'webfonts'), path.join(publicVendor, 'fontawesome', 'webfonts'));

console.log('ParkPal vendor assets copied into public/vendor for offline use.');
