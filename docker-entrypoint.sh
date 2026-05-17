#!/bin/sh
set -e

# Generate /config.json from environment variables.
# The frontend fetches this at startup to configure Convex and Google OAuth.
cat > /usr/share/nginx/html/config.json <<EOF
{
  "CONVEX_URL": "${CONVEX_URL}",
  "CONVEX_SITE_URL": "${CONVEX_SITE_URL}",
  "GOOGLE_CLIENT_ID": "${GOOGLE_CLIENT_ID}"
}
EOF

exec nginx -g 'daemon off;'
