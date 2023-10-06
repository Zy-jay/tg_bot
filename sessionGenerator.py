from telethon import TelegramClient, events, sync
import requests
import sys
import json 
from telethon.sessions import StringSession
import pyinputplus as pyip

def print_to_stdout(a):
    sys.stdout.write(a)
    sys.stdout.flush()

with TelegramClient(StringSession(), int(pyip.inputStr('API ID > ')), pyip.inputStr('API HASH > ')) as client:
    print(client.session.save())

client.start()

