## Инструкция по запуску и работе с ботом

настройка .env:

```css
BOT_TOKEN="токен бота из botFather"
TELEGRAM_ADMINS=[2323232, 3333333, 44444, 1111111, 999999] #список ID админов в ТГ - только они могут управлять ботом
DEXTOOLS_API_KEY="апи ключ dextools (апи для получения информации о токенах)"
TELEGRAM_CHANNEL="@testbot0077" #ссылка на канал (имя канала) где будут публиковаться посты - ФОРМАТ СТРОГО ПО ПРИМЕРУ 

DATABASE_HOST="IP сервера с базой данных (PostgreSQL)", 
DATABASE_PORT="5432" #порт postgreSQL
DATABASE_NAME="receiver" #имя базы данных - не менять
DATABASE_USER="postgres" #имя пользователя postgreSQL
DATABASE_PASSWORD="пароль от postgreSQL"

PM2_NAME="bot1" #имя с которым будет запущен pm2 - предлагаю не менять
BOT_NUMBER="6" #номер бота - читайте самый последний блок про работу кода
```

## База данных

Дапм базы (только структура) данных находится в репозитории - нужно его загрузить в PostgreSQL.  
Если база данных удаленная, на сервере нужно разрешить удаленные подключения. Как это сделать (https://blog.logrocket.com/setting-up-a-remote-postgres-database-server-on-ubuntu-18-04/):

![](https://33333.cdn.cke-cs.com/kSW7V9NHUXugvhoQeFaf/images/4d9024d9e329545489bddc4f27bb13ca6a94b8e8612be740.png)![](https://33333.cdn.cke-cs.com/kSW7V9NHUXugvhoQeFaf/images/265874cbafd9b18a61a5d2b6a0f09c64531e91ef13b7c44d.png)

## Запуск на Ubuntu.

```plaintext
sudo apt update
curl -sL https://deb.nodesource.com/setup_16.x -o /tmp/nodesource_setup.sh
nano /tmp/nodesource_setup.sh
sudo apt install nodejs
sudo apt install python3-pip
sudo apt install python-is-python3
sudo pip install telethon

cd script #тут ваше название папки, а не 'script'
npm i
npm install pm2 -g
pm2 start --name=bot1 index.js
```

Теперь бот доступен для админов. Его команды:

**1\. включить топы / выключить**

```plaintext
/init_tops
/uninit_tops
```

**2\. добавить аккаунт**

```plaintext
/add_account 
Прокси
Api id
Api hash
Session
```

Пример:

```plaintext
/add_account
192.177.42.20:63725:логин:пароль
26713606
3gf423fg423g432432g34g32
1BAAOMTQ5LjE1NC4xNjcuOTEAUMLgYMOeE8hUOsfdfdsE8q7/Vuzwptu7pjQj72njYCqSw4OrYfdsfds6qCO9JwGdT7NBCcblXx6849kA3p5Cg6OK6YBlLwJE4H3P8CvUWmBGQvpxRpP1bcPn6fXzGU6tKeB1smEdP92xEGKgB0X1asfdsdff/oI0oODqCFMqRfFjx4w3pcvvGN2aE+7EyuCn9ut4zjdfuT8lb9HR/Nr5Ml+kF1bjXN4dTg9s5xCG8QhhnzwEZfRs1RmRTG94tetwk+QiRGR/3orcJN2AsDjO/60iTvP1JpLs7gPUX9tRh0GKREqqlaMFbF8hyZnQCPnVRJZyXYzTSklWGvQHJftU7lpT9bPrOre6JCk=
```

**3\. показать список аккаунтов**

```plaintext
/list_accounts 
```

**4\. удалить аккаунт**

```plaintext
/remove_account <id>
```

**5\. сменить активный аккаунт**

```plaintext
/swap_account <id>
```

**6\. Получить все каналы которые есть на аккаунте но нет в базе у бота и добавить их в базу**

```plaintext
/parse_account
```

**7\. Получить список каналов по которым работает бот**

```plaintext
/list
```

**8\. Добавить каналы в базу бота (+ бот в них вступает по API Telegram)**

```plaintext
/add_channels
ссылка
ссылка
...
```

**9\. Удалить каналы из базы бота**

```plaintext
/remove_channels
ссылка
ссылка
...
```

**9\. Добавить каналы только для одного бота**

```plaintext
/add_channels_for_one <id>
ссылка
ссылка
...
```

## Работа кода.

Один и тот же скрипт стоит на нескольких серверах (в данный момент их 5) + 1 сервер с базой данных (на него можно дополнительно поставить скрипт если нужно, сейчас там только база данных PostgreSQL - данные для авторизации в нее можно увидеть в .env скрипта на любом сервере).

Каждый скрипт работает с 1 ботом из botFather и 1 аккаунтом Telegram, через gram.js. + у каждого скрипта в запасе может быть несколько аккаунтов ТГ - хранятся в базе. База общая, у каждого аккаунта есть поле с ID бота, которому он принадлежит. ID бота хранится в .env (BOT\_NUMBER - string).  Аккаунт в ТГ получает все входящие сообщения и передает их botFather боту для отправки в канал. Основной обработчик сообщений:

```javascript
let handlerBusy = false;
client.addEventHandler(async (event) => {
    while (handlerBusy) {
        await new Promise(resolve => setTimeout(resolve, 30));
    }

    handlerBusy = true;
    console.log('set handler busy');
    try {
        await eventPrint(event);
    } catch (error) {
        console.log(error);
    }

    handlerBusy = false;
    console.log('release handler');
}, new NewMessage({}));
```

`eventPrint` - функция обработки колла (см. в коде).

Вся стилизация сообщений находится в файле methods/texts.js - в нем все функции генерации текста сообщений в канале.  
  
Если нужно добавить новый сервер, **ВАЖНО** перед запуском на нем скрипта пломенять BOT\_NUMBER в env. В противном случае, бот получит из базы аккаунт который уже используется другим ботом и с большой вероятностью при попытке запуска, телеграм разорвет соединение с ботом, чей BOT\_NUMBER в .env.  
\+ для запуска боту обязательно нужен изначальный аккаунт в базе. Т.е чтобы запустить нового бота, сначала нужно добавить ему как минимум 1 аккаунт в базе данных.