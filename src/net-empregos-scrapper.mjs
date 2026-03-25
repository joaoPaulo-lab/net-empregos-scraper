import { chromium } from 'playwright'
import fs, { link } from 'fs';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';



//É necessário fazer duas vezes o scrapping então fiz uma função
//Faz scraping do texto dos options e valor das prop. values
async function dropBoxScrapper(formCategorias) {
    let optionsAndValues = []
    let i = 0;
    //Scraping das opções de Categorias
    for (const option of await formCategorias.locator('option').all()) {

        let titulo = await option.textContent();
        let valor = await option.getAttribute('value');
        
        optionsAndValues.push({
            "index": i,
            "titulo":titulo,
            "valor":valor
        });
        i++;
    }
    return optionsAndValues;
}

function mostrarLista(itens){
    //Desconstroi para separar a chave index das outras duas
    for (let item of itens) {
        console.log(`${item.index} - ${item.titulo}`);
    }
}

async function fazerPergunta(pergunta){

    const rl = readline.createInterface({ input, output });
    const resposta = await rl.question(pergunta); 
    rl.close();
    return resposta;
}


async function pegarLinks(page) {
    let linkVagas = [];
    await page.pause();
    const jobs = page.locator('.job-item');
    console.log(jobs);
    let quantidadeVagas = await jobs.count();
    console.log(quantidadeVagas + ' vagas encontradas na página atual.');

    for (let i = 0; i < quantidadeVagas; i++) {

        console.log(`Processando vaga ${i + 1} de ${quantidadeVagas}`);

        const job = await jobs.nth(i);
        let href = await job.locator('a.oferta-link').first().getAttribute('href');

        linkVagas.push(href);
    }
    return linkVagas;
}

async function run() { 

    const browser = await chromium.launch({ headless: false })
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('A aceder website...')
    await page.goto('https://www.net-empregos.com/');
    
    //Remove as perguntas iniciais ao abrir o site.
    await page.getByRole('button', { name: 'Permitir seleção' }).click();
    await page.getByRole('button', { name: 'Não Ativar' }).click();

    //Variaveis a serem escolhidas pelo utilizador
    const formCategorias = page.locator('#categoria');
    const formZonas = page.locator('#zona');
    const formChave = page.locator('#chaves');

    
    //Pega a lista de categorias e zonas
    let categorias = await dropBoxScrapper(formCategorias);
    let zonas = await dropBoxScrapper(formZonas);
    
    console.log('Categorias');
    mostrarLista(categorias);

    const escolhaCategoria = await fazerPergunta('Escolha a categoria pelo index: ')
    //Separa o objeto escolhido.
    const categoriaEscolhida =  categorias.find(categoria=>categoria.index == parseInt(escolhaCategoria))
    
    console.log('Em qual zona deseja fazer a pesquisa?');
    
    console.log('Zonas');
    mostrarLista(zonas);
    
    const escolhaZona = await fazerPergunta('Escolha a zona pelo index: ')
    //Separa o objeto escolhido.
    const zonaEscolhida =  zonas.find(zona=>zona.index == parseInt(escolhaZona))

    const escolhaChave = await fazerPergunta('Escolha uma palavra chave ex: Suporte, Vendas...')
    let chave = (await escolhaChave).replaceAll(' ','+')


    console.log(`A procurar vagas de ${categoriaEscolhida.titulo} com ${escolhaChave} na zona de ${zonaEscolhida.titulo}...`);
    
    // await page.pause()
    
    
    await formChave.fill(escolhaChave);
    await formCategorias.selectOption(categoriaEscolhida.valor);
    await formZonas.selectOption(zonaEscolhida.valor);
    
    await page.getByRole('button', { name: ' Pesquisar' }).click();
    

    //Pega os links da pagina inical
    
    let linkVagas = [...await pegarLinks(page)]
    //pega o texto da paginação e a quantidade de vagas para descobrir quantas paginas foram retornadas
    const frasePaginacao = await page.getByRole('heading', { name: 'ofertas encontradas' }).textContent()

    // console.log(frasePaginacao.split(' '))

    //A frase de paginação só inclui este caractere caso hajam multiplas paginas
    if(frasePaginacao.includes('-')){
        
          

        let paginacaoSeparada = frasePaginacao.split('-')[1].split(' ');
        for (let i = 2; i <= paginacaoSeparada[4]; i++) {

            //Loop começa na pagina 2 
            console.log(`Acessando página ${i} de ${paginacaoSeparada[4]}`);

            
            let pesquisaPorUrl = `https://www.net-empregos.com/pesquisa-empregos.asp?page=${i}&chaves=${chave}&cidade=&categoria=${categoriaEscolhida.valor}&zona=${zonaEscolhida.valor}&tipo=0`;  
            //abre uma nova pagina
            let newP = await context.newPage();
            try {
                await newP.goto(pesquisaPorUrl);
                //Desconstroi o array que recebe e insere os valores no array linkVagas
                linkVagas.push(...await pegarLinks(newP));
                
            } catch (error) {
                console.log(` página ${i} falhou, pulando para a proxima`)
                continue;
            }

            await newP.close()
        }

    }
    else {
        console.log('Somente uma pagina foi encontrada');
        
    }


   
    //2 e 4 sao os indices onde estao o numero da pagina atual e o numero total de paginas, respectivamente
    //Para fins de debug
    // console.log('Paginacao:', paginacaoSeparada);
    

    

    //Faz um loop pelas paginas e coleta os links
    //TODO try catch para pesquisas que retornam somente uma pag.

   
    
    console.log('Links coletados:', linkVagas);
    console.log('Total de links coletados:', linkVagas.length); 

    //Isto sera feito por vaga...
    for (let i = 0; i < linkVagas.length; i++) {

        try {
            console.log(`Acessando vaga ${i + 1} de ${linkVagas.length}`);
            let ref = linkVagas[i].split('/')[1]
            
            let novaUrl = 'https://www.net-empregos.com' + linkVagas[i];
            
            const newPage = await context.newPage()
            await newPage.goto(novaUrl);
        
            let dadosJob = await newPage.locator('script[type="application/ld+json"]').textContent();

            
            // Remove dados que quebram o JSON --
            dadosJob = dadosJob
            .replace(/\r?\n|\r/g, ' ')
            .replace(/\t/g, ' ')
            .replace(/<br\s*\/?>/gi, '\\n')
            .trim();
            
            const jsonJob = JSON.parse(dadosJob);
            
            //Todo, decidir o que fazer com os Jsons...

            fs.writeFileSync(`../data/vaga_${linkVagas[i].split('/')[1]}_${linkVagas[i].split('/')[2]}.json`, dadosJob);
            await newPage.close();
        } catch (error) {

            console.log(error);
            console.log('Scraping da vaga falhou, passando para a próxima. ')
            await newPage.close();
            continue;

        }
        // await newPage.pause()        
        
    }   
    await browser.close()
    return;
}

  
run()
