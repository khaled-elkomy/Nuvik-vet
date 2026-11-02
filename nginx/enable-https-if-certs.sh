#!/bin/sh
set -eu

https_config=/etc/nginx/conf.d/nuvik-vet-https.conf
if [ -s /etc/nginx/certs/localhost.crt ] && [ -s /etc/nginx/certs/localhost.key ]; then
  cp /etc/nginx/optional-https.conf "$https_config"
  if nginx -t; then
    echo "Nuvik Vet HTTPS enabled: local certificate and key validated."
  else
    rm -f "$https_config"
    echo "Nuvik Vet HTTPS disabled: local certificate or HTTPS config failed validation; HTTP remains enabled."
  fi
else
  rm -f "$https_config"
  echo "Nuvik Vet HTTPS disabled: local certificate/key not found; HTTP remains enabled."
fi
