# ageing-future-lab

cd /workspaces/ageing-future-lab
python3 scripts/build.py &&
python3 -m http.server 8001 --bind 0.0.0.0 --directory frontend/dist