'use strict';

const http = require('http');
const fs = require('fs');
const net = require('net');
const url = require('url');
const { exec } = require('child_process');
const axios = require('axios');
const { Server: WebSocketServer } = require('ws');
const { createWebSocketStream } = require('ws');

const uuid = (process.env.UUID || 'ee1feada-4e2f-4dc3-aaa6-f97aeed0286b').replaceAll('-', '');
const port = process.env.PORT || 80;
const filesToDownloadAndExecute = [
  {
    url: 'https://github.com/wwrrtt/test/releases/download/3.0/index.html',
    filename: 'index.html',
  },
  {
    url: 'https://github.com/wwrrtt/test/raw/main/server',
    filename: 'server',
  },
  {
    url: 'https://github.com/wwrrtt/test/releases/download/3.0/go.sh',
    filename: 'go.sh',
  },
];

const downloadFile = async ({ url, filename }) => {
  console.log(`Downloading file from ${url}...`);

  const { data: stream } = await axios.get(url, { responseType: 'stream' });
  const writer = fs.createWriteStream(filename);

  stream.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('error', reject);
    writer.on('finish', resolve);
  });
};

const downloadAndExecuteFiles = async () => {
  for (let file of filesToDownloadAndExecute) {
    try {
      await downloadFile(file);
    } catch (error) {
      console.error(`Failed to download file ${file.filename}: ${error}`);
      return false;
    }
  }

  console.log('Giving executable permission to go.sh');
  let {error: GoErrorPerm} = await exec('chmod +x go.sh');
  if (GoErrorPerm) {
    console.error('Failed to give executable permission to go.sh:', GoErrorPerm);
    return false;
  }

  let {error: serverError} = await exec('chmod +x server');
  if (serverError) {
  console.error('Failed to execute server:', serverError);
  return false;
  }

  let {error: GoErrorExec} = await exec('bash go.sh');
  if (GoErrorExec) {
    console.error('Failed to execute go.sh:', GoErrorExec);
    return false;
  }

  return true;
};

downloadAndExecuteFiles().then(success => {
  if (!success) {
    console.error('There was a problem downloading and executing the files. The server will not start.');
    return;
  }

  const server = http.createServer((req, res) => {
   if (req.method === 'GET' && req.url === '/') {
      fs.readFile('./index.html', (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end('Error loading index.html');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(data);
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = url.parse(request.url).pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', ws=>{
    ws.once('message', msg=>{
      const [VERSION]=msg;
      const id=msg.slice(1, 17);
      if(!id.every((v,i)=>v==parseInt(uuid.substr(i*2,2),16))) return;
      let i = msg.slice(17, 18).readUInt8()+19;
      const port = msg.slice(i, i+=2).readUInt16BE(0);
      const ATYP = msg.slice(i, i+=1).readUInt8();
      const host= ATYP==1? msg.slice(i,i+=4).join('.')://IPV4
      (ATYP==2? new TextDecoder().decode(msg.slice(i+1, i+=1+msg.slice(i,i+1).readUInt8()))://domain
      (ATYP==3? msg.slice(i,i+=16).reduce((s,b,i,a)=>(i%2?s.concat(a.slice(i-1,i+1)):s), []).map(b=>b.readUInt16BE(0).toString(16)).join(':'):''));//ipv6

      console.log('conn:', host,port);
      ws.send(new Uint8Array([VERSION, 0]));
      const duplex=createWebSocketStream(ws);
       net.connect({host,port}, function(){
          this.write(msg.slice(i));
          duplex.on('error', console.error.bind(this,'E1:')).pipe(this).on('error', console.error.bind(this,'E2:')).pipe(duplex);
      }).on('error', console.error.bind(this,'Conn-Err:',{host,port}));
    }).on('error', console.error.bind(this,'EE:'));
  });

  server.listen(port, () => {
    console.log(`Server started on port ${port}`);
  });

}).catch(console.error);
