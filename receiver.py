from telethon import TelegramClient, events, sync
import sys
import json 
import time
from telethon.sessions import StringSession
import requests

api_id = sys.argv[1]
api_hash = sys.argv[2]
session = sys.argv[3]

client = TelegramClient(StringSession(session), int(api_id), api_hash)
client.start()
client.get_dialogs()


printerBusy = False
@client.on(events.NewMessage())
async def handler(event):
    global printerBusy

    while printerBusy == True:
        time.sleep(0.2)

    printerBusy = True
    event_dict = event.to_dict()
    message_dict = event_dict['message'].to_dict()

    requests.post("http://localhost:3010", 
        data=json.dumps(message_dict, default=str),
        headers={'Content-type': 'application/json', 'Accept': 'text/plain'}
    )
    printerBusy = False

client.run_until_disconnected()



