FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html about.html qr_code.html robots.txt sitemap.xml /usr/share/nginx/html/
COPY css/ js/ icons/ images/ /usr/share/nginx/html/
EXPOSE 80
