import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import { antdTheme } from './theme/antdTheme';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider theme={antdTheme}>
      <AntdApp>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>
);
