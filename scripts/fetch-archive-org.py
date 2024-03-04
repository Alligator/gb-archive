import requests
import json

url = 'https://archive.org/advancedsearch.php?q=collection%3A%22giant-bomb-archive%22&fl%5B%5D=date&fl%5B%5D=description&fl%5B%5D=identifier&fl%5B%5D=subject&fl%5B%5D=title&sort%5B%5D=&sort%5B%5D=&sort%5B%5D=&rows=20000&page=1&output=json'

resp = requests.get(url)
resp.raise_for_status()
j = resp.json()
videos = j['response']['docs']
json.dump(videos, open('archive-org.json', 'w'))
