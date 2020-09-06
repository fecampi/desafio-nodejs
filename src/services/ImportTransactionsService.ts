import csvParse from 'csv-parse';
import fs from 'fs';
import { getCustomRepository, getRepository, In } from 'typeorm';
import Transaction from '../models/Transaction';
import Category from '../models/Category';
import TransactionsRepository from '../repositories/TransactionsRepository';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(FilePath: string): Promise<Transaction[]> {
    const transactionRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);

    const contactsReadStream = fs.createReadStream(FilePath);
    const parseConfig = csvParse({
      delimiter: ',',
      from_line: 2,
    });

    const parseCSV = contactsReadStream.pipe(parseConfig);

    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];
    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      // Verifica se está vazio
      if (!title || !type || !value) return;

      categories.push(category);
      transactions.push({ title, type, value, category });
    });
    // Espera o evento 'end' e termina
    await new Promise(resolve => parseCSV.on('end', resolve));

    // verifica se categoria já existe
    const existentCategories = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    // pega só os titulos
    const existentCategoriesTitles = existentCategories.map(
      (category: Category) => category.title,
    );

    // se categoria não existe no banco de dados adiciona no adCategoryTitle
    const addCategoryTitles = categories
      .filter(category => !existentCategoriesTitles.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    // Adiciona no banco de dados
    const newCategories = categoriesRepository.create(
      addCategoryTitles.map(title => ({
        title,
      })),
    );
    await categoriesRepository.save(newCategories);

    // Adicionar transactions  no banco
    const finalCategories = [...newCategories, ...existentCategories];
    const createTransactions = transactionRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );
    await transactionRepository.save(createTransactions);

    // excluir arquivo
    await fs.promises.unlink(FilePath);
    return createTransactions;
  }
}
export default ImportTransactionsService;
