import {scraper} from './src/net-empregos-scraper.mjs';


(async () => {
    try {
        await scraper(); 
    } catch (error) {
        console.error('Erro durante o scraping:', error);
    }
})();