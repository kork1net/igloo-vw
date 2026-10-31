import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const catalogModulePath = require.resolve('../scripts/item-catalog.cjs');
delete require.cache[catalogModulePath];
let catalog = require(catalogModulePath);

export default function itemsPlugin() {
    catalog.writeCatalog();
    return {
        name: 'clothing-catalog',
        configureServer(server) {
            // Also discover assets on refresh if the OS watcher missed a file event.
            server.middlewares.use((request, response, next) => {
                const pathname = request.url?.split('?')[0];
                if (pathname === '/' || pathname === '/index.html') {
                    try { catalog.writeCatalog(); }
                    catch (error) { server.config.logger.error(error.message); }
                }
                next();
            });
            server.watcher.add([catalog.itemsDirectory, catalogModulePath]);
            const update = filename => {
                if (path.resolve(filename) === catalogModulePath) {
                    try {
                        delete require.cache[catalogModulePath];
                        catalog = require(catalogModulePath);
                        catalog.writeCatalog();
                        server.ws.send({ type: 'full-reload', path: '*' });
                    } catch (error) { server.config.logger.error(error.message); }
                    return;
                }
                const relative = path.relative(catalog.itemsDirectory, path.resolve(filename));
                if (!relative.startsWith('..') && !path.isAbsolute(relative) && /\.(png|json)$/.test(filename)) {
                    try {
                        catalog.writeCatalog();
                        server.ws.send({ type: 'full-reload', path: '*' });
                    }
                    catch (error) { server.config.logger.error(error.message); }
                }
            };
            for (const event of ['add', 'change', 'unlink']) server.watcher.on(event, update);
            server.httpServer?.once('close', () => {
                for (const event of ['add', 'change', 'unlink']) server.watcher.off(event, update);
            });
        }
    };
}
