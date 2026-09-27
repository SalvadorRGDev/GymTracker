import { render } from 'preact';
import { App } from './app';
import './estilos.css';

const raiz = document.getElementById('app');
if (raiz !== null) render(<App />, raiz);
