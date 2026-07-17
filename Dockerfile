FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY index.html about.html qr_code.html robots.txt sitemap.xml /usr/share/nginx/html/

COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js
COPY icons /usr/share/nginx/html/icons
COPY images /usr/share/nginx/html/images

EXPOSE 80
